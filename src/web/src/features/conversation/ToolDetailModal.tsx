import type { DetailModalProps } from "./ToolDetailShared";
import { BashDetailModal } from "./details/BashDetailModal";
import { DefaultDetailModal } from "./details/DefaultDetailModal";
import { EditDetailModal } from "./details/EditDetailModal";
import { ReadDetailModal } from "./details/ReadDetailModal";
import { WriteDetailModal } from "./details/WriteDetailModal";

export function ToolDetailModal(props: DetailModalProps) {
  const DetailModal =
    props.name === "read" ? ReadDetailModal :
    props.name === "bash" ? BashDetailModal :
    props.name === "write" ? WriteDetailModal :
    props.name === "edit" ? EditDetailModal : DefaultDetailModal;
  return <DetailModal {...props} />;
}
