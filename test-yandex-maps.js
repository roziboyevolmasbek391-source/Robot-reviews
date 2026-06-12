// Since the connector is a TS file, we can require it using ts-node or just use standard require if we run it with ts-node!
// Let's write a script that runs via ts-node to test it.
const { YandexMapsConnector } = require("./src/connectors/yandex-maps/yandex-maps.connector");

async function main() {
  const connector = new YandexMapsConnector();
  console.log("Testing YandexMapsConnector for org ID 29008400275...");
  const reviews = await connector.getReviews("29008400275", 10);
  console.log(`Fetched ${reviews.length} reviews:`);
  console.log(JSON.stringify(reviews, null, 2));
}

main().catch(console.error);
