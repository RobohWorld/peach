import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 (S3-compatible). The bucket stays private: files are only reachable
// through short-lived signed URLs that this service hands out.
@Injectable()
export class R2Service {
  private client?: S3Client;

  private get bucket() {
    return process.env.R2_BUCKET ?? '';
  }

  private get s3(): S3Client {
    if (!this.client) {
      const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
      if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !this.bucket) {
        throw new ServiceUnavailableException('Media storage is not configured');
      }
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
        // R2 does not accept the default checksum headers newer SDK versions add.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    }
    return this.client;
  }

  /** Upload URL (10 min). Content-Type and the exact size are part of the signature. */
  presignPut(key: string, contentType: string, contentLength: number) {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
      { expiresIn: 600, signableHeaders: new Set(['content-type']) },
    );
  }

  presignGet(key: string, expiresInSeconds: number) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  /** Returns size and content type, or null when the object does not exist. */
  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0), contentType: String(r.ContentType ?? '') };
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
}
