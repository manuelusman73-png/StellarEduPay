import '../styles/globals.css';
import Navbar from '../components/Navbar';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Navbar />
      <main className="app-container">
        <Component {...pageProps} />
      </main>
    </>
  );
}
