import { FormLogin } from "@/components/pages/formLogin";
import Image from "next/image";

export function Login() {
  return (
    <div className="flex min-h-svh">
      <section className="flex-1 hidden lg:flex items-center justify-center p-10 bg-(--green-3)">
        <Image
          className="w-full max-w-md h-auto"
          width={600}
          height={300}
          alt="Logo Tio Rico"
          src={"Logo-2.svg"}
        />
      </section>
      <section className="flex flex-1  items-center justify-center p-6 sm:p-10">
        <FormLogin />
      </section>
    </div>
  );
}
