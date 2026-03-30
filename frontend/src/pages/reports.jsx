import Head from "next/head";
import ReportDownload from "../components/ReportDownload";

export default function ReportsPage() {
  return (
    <>
      <Head>
        <title>Reports | StellarEduPay</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <ReportDownload />
    </>
  );
}
