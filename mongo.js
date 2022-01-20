import { MongoClient } from "mongodb";

const setupMongo = async () => {
  const client = await MongoClient.connect(
    process.env.MONGO_URI_LOCAL,
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  );
  const db = await client.db();
  console.log("New Mongo connection established");
  return db;
  
};

const connectToMongo = async () => {
  return await setupMongo();
};

export { connectToMongo };
