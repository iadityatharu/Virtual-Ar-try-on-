import React from "react";
import ArTryOn from "./components/ArTryOn";

const App = () => {
  return (
    <div className="page">
      <header className="hero">
        <h1>AR Lipstick &amp; Eyelash Try-On Demo</h1>
        <p>
          Turn on your webcam, pick a lipstick shade, and toggle virtual
          eyelashes. Everything runs fully in the browser.
        </p>
      </header>
      <ArTryOn />
    </div>
  );
};

export default App;
