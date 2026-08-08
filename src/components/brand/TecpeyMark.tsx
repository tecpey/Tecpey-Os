import Image, { type ImageProps } from "next/image";

export const TECPEY_MARK_SRC = "/images/tecpey-logo.png";

type TecpeyMarkProps = Omit<ImageProps, "src" | "alt"> & {
  alt?: string;
};

export function TecpeyMark({ alt = "TecPey", ...props }: TecpeyMarkProps) {
  return <Image src={TECPEY_MARK_SRC} alt={alt} {...props} />;
}
