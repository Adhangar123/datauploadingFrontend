import { useEffect, useState } from "react";
import "../style/BirdFlock.css";

function BirdFlock() {

  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [bird, setBird] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const move = (e) => {
      setMouse({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", move);

    return () => window.removeEventListener("mousemove", move);
  }, []);

  useEffect(() => {

    const interval = setInterval(() => {

      setBird((prev) => ({
        x: prev.x + (mouse.x - prev.x) * 0.15,
        y: prev.y + (mouse.y - prev.y) * 0.15
      }));

    }, 16);

    return () => clearInterval(interval);

  }, [mouse]);

  return (
    <img
      src="/img/hummingbird.png"
      className="bird"
      style={{
        left: bird.x,
        top: bird.y
      }}
      alt="bird"
    />
  );
}

export default BirdFlock;