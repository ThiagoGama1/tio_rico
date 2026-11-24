import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function FormLogin() {
  return (
    <div className="w-full max-w-md s px-4 grid gap-9 items-center">
      <h1 className="h1 text-center"> Acesso </h1>
      <div className="grid gap-6">
        <Input placeholder="Email" />
        <Input type="password" placeholder="Senha" />
      </div>
      <div className="grid gap-5 justify-center">
        <Button> Login </Button>
        <Button variant={"secondary"}> Sign In</Button>
        <Button variant={"link"}> Esqueceu a Senha? </Button>
      </div>
    </div>
  );
}
