/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Shown in error and feedback reports, so we know which version an owner was on.
  env: { NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7) },
};
