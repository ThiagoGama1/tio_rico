import Login from "./login/page";

export default function Home() {
  return (
    <div>
      {/* Por enquanto vamos deixar apenas o redirecionamento para página de login
       mas isso deve mudar de acordo com o estado do usuario!! */}
      <main>
        <Login />
      </main>
    </div>
  );
}
