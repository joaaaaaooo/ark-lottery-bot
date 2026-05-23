require('dotenv').config();

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot ARK activo ✅');
});

app.listen(3000, () => {
  console.log('🌐 Web activa en puerto 3000');
});

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// 📊 stats
const stats = new Map();

// 🎲 RECOMPENSAS
const rewards = [
  { name: "Desmodus", chance: 0.5, rarity: "LEGENDARIO" },
  { name: "Brontosaurus", chance: 1, rarity: "LEGENDARIO" },
  { name: "Moneda de Oro", chance: 1.5, rarity: "ÉPICO" },

  { name: "Sabertooth", chance: 3, rarity: "RARO" },
  { name: "Rifle Longneck", chance: 4, rarity: "RARO" },
  { name: "Gigantopithecus", chance: 5, rarity: "RARO" },

  { name: "Otter", chance: 6, rarity: "POCO COMÚN" },
  { name: "Shinehorn", chance: 6, rarity: "POCO COMÚN" },
  { name: "Iguanodon", chance: 7, rarity: "POCO COMÚN" },

  { name: "Cryopods x10", chance: 10, rarity: "COMÚN" },
  { name: "Raptor", chance: 12, rarity: "COMÚN" },
  { name: "Parasaurus", chance: 15, rarity: "COMÚN" },

  { name: "Kit Inicio", chance: 18, rarity: "BÁSICO" },
  { name: "Moneda de Plata", chance: 11, rarity: "BÁSICO" }
];

function roll() {
  let total = rewards.reduce((a, b) => a + b.chance, 0);
  let r = Math.random() * total;

  for (const item of rewards) {
    if (r < item.chance) return item;
    r -= item.chance;
  }
}

// ⏳ COOLDOWN 3 DÍAS
const cooldown = new Map();
const COOLDOWN_TIME = 3 * 24 * 60 * 60 * 1000;

// 🧾 comandos
const commands = [
  new SlashCommandBuilder()
    .setName('spin')
    .setDescription('Tira la ruleta ARK'),

  new SlashCommandBuilder()
    .setName('testspin')
    .setDescription('Spin sin cooldown (solo staff)')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ comandos registrados");
  } catch (err) {
    console.error(err);
  }
})();

// 🤖 INTERACCIONES
client.on('interactionCreate', async interaction => {

  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  // 🎰 SPIN
  if (interaction.commandName === 'spin') {

    const lastUsed = cooldown.get(userId);
    const now = Date.now();

    if (lastUsed && now - lastUsed < COOLDOWN_TIME) {

      const remaining = COOLDOWN_TIME - (now - lastUsed);
      const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));

      return interaction.reply({
        content: `⏳ espera ${days} día(s) para volver a tirar la ruleta`,
        ephemeral: true
      });
    }

    cooldown.set(userId, now);
    await handleSpin(interaction);
  }

  // 🔥 TESTSPIN SOLO STAFF
  if (interaction.commandName === 'testspin') {

    const staffRoleId = process.env.STAFF_ROLE_ID;
    const isStaff = interaction.member.roles.cache.has(staffRoleId);

    if (!isStaff) {
      return interaction.reply({
        content: "❌ No tienes permisos para usar este comando.",
        ephemeral: true
      });
    }

    await handleSpin(interaction);
  }
});

// 🎰 SISTEMA PRINCIPAL
async function handleSpin(interaction) {

  await interaction.deferReply();

  const user = stats.get(interaction.user.id) || { spins: 0 };
  user.spins++;
  stats.set(interaction.user.id, user);

  await new Promise(r => setTimeout(r, 2000));

  const reward = roll();

  const embed = new EmbedBuilder()
    .setTitle("🎰 Ruleta ARK")
    .setDescription(`🎁 ${reward.name}\n⭐ Rareza: **${reward.rarity}**`)
    .setColor("Purple");

  await interaction.editReply({ embeds: [embed] });

  // 🎫 TICKET
  try {

    const cleanName = interaction.user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');

    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-ruleta-${cleanName}`,
      type: ChannelType.GuildText,
      parent: process.env.TICKET_CATEGORY_ID || null,

      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ],
        },
        {
          id: process.env.STAFF_ROLE_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels
          ],
        }
      ]
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim")
        .setLabel("Reclamar")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("close")
        .setLabel("Cerrar")
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content:
`🎫 Ticket de ${interaction.user}

🎁 Premio: **${reward.name}**

🧑‍💼 Staff: gestionar entrega`,
      components: [row]
    });

  } catch (err) {
    console.error("❌ ERROR TICKET:", err);
  }
}

// 🔘 BOTONES
client.on('interactionCreate', async interaction => {

  if (!interaction.isButton()) return;

  if (interaction.customId === "close") {
    await interaction.channel.delete();
  }

  if (interaction.customId === "claim") {
    await interaction.reply({
      content: "✅ reclamado",
      ephemeral: true
    });
  }
});

client.login(process.env.TOKEN);
