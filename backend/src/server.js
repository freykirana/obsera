const app = require("./app");
const { env } = require("./config/env");

app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port}`);
});
