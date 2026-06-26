import Image from "next/image";
import Link from "next/link";

interface PriceCardProps {
  pair: string;
  price: string | number;
  change: string;
  logo: string;
}

export default function PriceCard({ pair, price, change, logo }: PriceCardProps) {
  const isPositive = change.startsWith("+");

  const symbolSlug = pair.replace("/", "-").toLowerCase();

  return (
    <Link
      href={`/crypto/${symbolSlug}`}
      className="card backdrop-blur-md rounded-xl p-4 flex flex-col items-center 
                 shadow-lg border border-primary hover:opacity-80 transition cursor-pointer
                 w-full h-auto sm:h-[180px]"
    >
      <div className="w-10 h-10 rounded-full mb-3 overflow-hidden">
        <Image
          src={logo || "/default-coin.svg"}
          alt={pair}
          width={40}
          height={40}
          className="object-cover"
          unoptimized
        />
      </div>

      <p className="text-sm font-semibold">{pair}</p>
      <p className="text-xl font-bold">{price}</p>

      <p
        className={`text-sm font-semibold ${
          isPositive ? "text-[#009826]" : "text-[#ff0000]"
        }`}
      >
        {change}
      </p>
    </Link>
  );
}
