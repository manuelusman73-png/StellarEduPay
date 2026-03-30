import Head from "next/head";
import PaymentForm from "../components/PaymentForm";
import VerifyPayment from "../components/VerifyPayment";

export default function PayFees() {
  return (
    <>
      <Head>
        <title>Pay Fees | StellarEduPay</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <PaymentForm />
      <hr style={{ maxWidth: 480, margin: "0 auto" }} />
      <VerifyPayment />
    </>
  );
}
