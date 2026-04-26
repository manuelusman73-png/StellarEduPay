import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Something went wrong.</h2>
          <p>An unexpected error occurred. Please try again.</p>
          <button onClick={() => this.setState({ hasError: false })}>Retry</button>
          <br />
          <a href="/">Go to Home</a>
        </div>
      );
    }
    return this.props.children;
  }
}
