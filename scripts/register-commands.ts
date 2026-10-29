const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !appId)
  throw new Error("Defina DISCORD_BOT_TOKEN e DISCORD_CLIENT_ID.");

const scope = guildId ? `/guilds/${encodeURIComponent(guildId)}` : "";
const endpoint = `https://discord.com/api/v10/applications/${encodeURIComponent(appId)}${scope}/commands`;
const command = {
  name: "preco",
  description: "Consulta preços atuais de um item em Primal",
  type: 1,
  options: [
    {
      name: "nome",
      description: "Nome do item no jogo",
      type: 3,
      required: true,
      autocomplete: true,
      min_length: 2,
      max_length: 100,
    },
  ],
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(command),
});
if (!response.ok)
  throw new Error(
    `Discord recusou o registro do comando (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`,
  );
console.log(
  `Comando /preco registrado (${guildId ? `servidor ${guildId}` : "global"}).`,
);
