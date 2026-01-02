import React from "react";
import ArTryOn from "./components/ArTryOn";

const App = () => {
  return (
    <div className="page">
      <img
        src="/NewLook.webp"
        alt="logo"
        style={{ height: "60px", width: "150px" }}
      />
      <ArTryOn />
    </div>
  );
};

export default App;
