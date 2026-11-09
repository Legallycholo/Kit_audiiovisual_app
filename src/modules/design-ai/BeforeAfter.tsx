import { useState } from "react";

/** The original photo and the render stacked, with a slider revealing the render. */
export function BeforeAfter({
  before,
  after,
  label,
  sample = false,
}: {
  before: string;
  after: string;
  label: string;
  /** A fixture render (the original photo): marked so it cannot pass for a real one. */
  sample?: boolean;
}) {
  const [split, setSplit] = useState(50);
  return (
    <figure className="kd-compare">
      <div className="kd-compare-frame">
        <img src={before} alt={`${label}: antes`} />
        <img
          className="kd-compare-after"
          src={after}
          alt={`${label}: después`}
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
        />
        <span
          className="kd-compare-line"
          style={{ left: `${split}%` }}
          aria-hidden="true"
        />
        <span className="kd-compare-tag before">Antes</span>
        <span className="kd-compare-tag after">
          {sample ? "Después · MUESTRA" : "Después"}
        </span>
        {sample && (
          <span className="kd-sample-band" aria-hidden="true">
            Vista de muestra: sin motor de imágenes conectado
          </span>
        )}
      </div>
      <label className="kd-compare-slider">
        <span className="visually-hidden">Comparar antes y después</span>
        <input
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(event) => setSplit(Number(event.target.value))}
        />
      </label>
      <figcaption className="muted">Visualización, no a escala</figcaption>
    </figure>
  );
}
