import Head from "next/head";
import Link from "next/link";

export default function Home() {
  return (
    <div style={{ textAlign: "center" }}>
      <Head>
        <title>StellarEduPay</title>
        <meta
          name="description"
          content="Transparent, instant school fee payments on the Stellar blockchain. Eliminate manual reconciliation and get instant proof of payment."
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <h1>StellarEduPay</h1>
      <p>Transparent school fee payments on the Stellar blockchain.</p>
      <Link href="/pay-fees">
        <button className="btn-primary">Pay School Fees</button>
      </Link>
    </div>
  );
}
