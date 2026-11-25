import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function FormLogin() {
  return (
    <div className="w-full max-w-md s px-4 grid gap-9 items-center">
      <h1 className="h1 text-center"> Acesso </h1>
      <div className="grid gap-6">
        <Input placeholder="Email" />
      </div>
      <div className="grid justify-items-center gap-5">
        <Button size={"lg"}>
          <h1> Gerar Código de Acesso </h1>
        </Button>
        <Button variant={"secondary"}> Sign up </Button>
      </div>
    </div>
  );
}
