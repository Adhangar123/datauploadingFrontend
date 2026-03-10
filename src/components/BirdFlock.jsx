import { useEffect, useState } from "react";
import "../style/BirdFlock.css";

function BirdFlock() {

  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  const [birds, setBirds] = useState([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ]);

  useEffect(() => {
    const move = (e) => {
      setMouse({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", move);

    return () => window.removeEventListener("mousemove", move);
  }, []);

  useEffect(() => {

    const interval = setInterval(() => {

      setBirds((prev) => {

        const newBirds = [...prev];

        newBirds[0] = {
          x: prev[0].x + (mouse.x - prev[0].x) * 0.2,
          y: prev[0].y + (mouse.y - prev[0].y) * 0.2
        };

        newBirds[1] = {
          x: prev[1].x + (newBirds[0].x - prev[1].x) * 0.2,
          y: prev[1].y + (newBirds[0].y - prev[1].y) * 0.2
        };

        newBirds[2] = {
          x: prev[2].x + (newBirds[1].x - prev[2].x) * 0.2,
          y: prev[2].y + (newBirds[1].y - prev[2].y) * 0.2
        };

        return newBirds;
      });

    }, 16);

    return () => clearInterval(interval);

  }, [mouse]);

  return (
    <>
      {birds.map((bird, index) => (
        <img
          key={index}
          src="/img/bird_1452405.png"
          className="bird"
          style={{
            left: bird.x,
            top: bird.y
          }}
          alt="bird"
        />
      ))}
    </>
  );
}

export default BirdFlock;