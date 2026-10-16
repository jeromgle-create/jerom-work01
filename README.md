This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## 관광지·축제 찾기 (`/tour`) 설정

`/tour` 페이지는 공공데이터포털의 「한국관광공사_국문 관광정보 서비스_GW」 API를 사용합니다.

1. `.env.example` 파일을 복사해 `.env.local` 파일을 만듭니다.
2. `TOUR_API_KEY=` 뒤에 활용신청 현황의 **일반 인증키(Decoding)** 를 붙여 넣습니다.
3. `npm run dev` 를 실행하고 http://localhost:3000/tour 에 접속합니다.

인증키는 서버에서만 사용되며 브라우저로 전달되지 않습니다. `.env.local` 은 git에 올라가지 않습니다.
배포(Vercel 등) 시에는 같은 이름의 환경변수를 배포 설정에 등록하세요.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
