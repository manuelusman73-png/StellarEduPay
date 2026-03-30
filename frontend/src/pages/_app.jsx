import "../styles/globals.css";
import Navbar from "../components/Navbar";
import ErrorBoundary from "../components/ErrorBoundary";

export default function MyApp({ Component, pageProps }) {
  return (
    <ErrorBoundary>
      <Navbar />
      <Component {...pageProps} />
    </ErrorBoundary>
  );
}
