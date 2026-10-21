import { lazy, Suspense } from "react";
import { Cpu } from "lucide-react";

const ModelIcon = lazy(() => import("@lobehub/icons/es/features/ModelIcon"));

export function ModelBrandIcon({
  model,
  size = 14,
}: {
  model: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="model-brand-icon"
      style={{ width: size, height: size }}
    >
      <Suspense fallback={<Cpu size={size} />}>
        <ModelIcon model={model} type="color" size={size} />
      </Suspense>
    </span>
  );
}
