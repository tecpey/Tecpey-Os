import Image, { type ImageProps } from "next/image";

export const TECPEY_MARK_SRC = "/images/tecpey-logo.png";
export const TECPEY_LOCKUP_SRC = "/images/brand/tecpey-lockup-fa-en.png";

type TecpeyMarkProps = Omit<ImageProps, "src" | "alt"> & {
  alt?: string;
  variant?: "icon" | "lockup";
};

export function TecpeyMark({ alt = "TecPey", variant = "icon", ...props }: TecpeyMarkProps) {
  return <Image src={variant === "lockup" ? TECPEY_LOCKUP_SRC : TECPEY_MARK_SRC} alt={alt} {...props} />;
}