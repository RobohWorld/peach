// Reading the Google birthday is a "sensitive" scope. While it is requested, Google only lets
// 100 users sign in until the app passes Google's verification review.
// Leave this off (default) to run in production with basic sign-in only: people then
// confirm their date of birth in the app (AgeScreen). Set EXPO_PUBLIC_GOOGLE_BIRTHDAY=true once verified.
export const USE_GOOGLE_BIRTHDAY = process.env.EXPO_PUBLIC_GOOGLE_BIRTHDAY === 'true';
export const BIRTHDAY_SCOPE = 'https://www.googleapis.com/auth/user.birthday.read';
