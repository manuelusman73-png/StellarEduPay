import Head from "next/head";
import PaymentForm from "../components/PaymentForm";
import VerifyPayment from "../components/VerifyPayment";

export default function PayFees() {
  return (
    <>
      <Head><title>Pay Fees | StellarEduPay</title></Head>
      <style>{`
        .payfees-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          max-width: 760px;
          margin: 2rem auto;
          padding: 0 1rem;
          align-items: start;
        }
        @media (max-width: 700px) {
          .payfees-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="payfees-grid">
        <PaymentForm />
        <VerifyPayment />
      </div>
    </>
  );
}
