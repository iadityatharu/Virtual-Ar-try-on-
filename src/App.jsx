import React from "react";
import ArTryOnPage from "./components/ArTryOn/ArTryOnPage";

const App = () => {
  return (
    <div className="page">
      <img
        src="/NewLook.webp"
        alt="logo"
        style={{ height: "60px", width: "150px" }}
      />
      <ArTryOnPage />
    </div>
  );
};

export default App;
