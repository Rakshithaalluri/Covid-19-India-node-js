const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let DB = null;

const initializationServerAndDb = async () => {
  try {
    DB = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3002, () => {
      console.log("Server Running at http://localhost:3002/");
    });
  } catch (error) {
    console.log(`DB ERROR: ${error.message}`);
    process.exit(1);
  }
};

initializationServerAndDb();

const convertStateObjectToResponseObject = (object) => {
  return {
    stateId: object.state_id,
    stateName: object.state_name,
    population: object.population,
  };
};

const convertDistrictObjectToResponseObject = (object) => {
  return {
    districtId: object.district_id,
    districtName: object.district_name,
    stateId: object.state_id,
    cases: object.cases,
    cured: object.cured,
    active: object.active,
    deaths: object.deaths,
  };
};

const authorizationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDB = await DB.get(selectUserQuery);

  if (userDB === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passwordCheck = await bcrypt.compare(password, userDB.password);
    if (passwordCheck === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authorizationToken, async (request, response) => {
  const getStateQuery = `
    SELECT 
    *
    FROM 
    state;`;

  const stateArray = await DB.all(getStateQuery);
  response.send(
    stateArray.map((eachState) => convertStateObjectToResponseObject(eachState))
  );
});

app.get("/states/:stateId/", authorizationToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateIdQuery = `
    SELECT *
    FROM 
    state
    WHERE 
    state_id = ${stateId};`;

  const state = await DB.get(getStateIdQuery);
  response.send(convertStateObjectToResponseObject(state));
});

app.get(
  "/districts/:districtId/",
  authorizationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT
    *
    FROM
    district
    WHERE
    district_id = '${districtId}';`;
    const district = await DB.get(getDistrictQuery);
    response.send(convertDistrictObjectToResponseObject(district));
  }
);

app.post("/districts/", authorizationToken, async (request, response) => {
  const { stateId, districtName, cases, cured, active, deaths } = request.body;
  const postDistrictQuery = `
    INSERT INTO
        district (state_id, district_name, cases, cured, active, deaths)
    VALUES
        ('${stateId}', '${districtName}', '${cases}', '${cured}', '${active}', '${deaths}');`;
  await DB.run(postDistrictQuery);
  response.send("District Successfully Added");
});

app.delete(
  "/districts/:districtId/",
  authorizationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `
    DELETE FROM 
    district
    WHERE 
    district_id = ${districtId};`;

    await DB.run(deleteQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authorizationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;

    const updateDistrictQuery = `
    UPDATE district
    SET
    district_name = '${districtName}',
    state_id = '${stateId}',
    cases = '${cases}',
    cured = '${cured}',
    active = '${active}',
    deaths = '${deaths}'
    WHERE 
    district_id = ${districtId};`;

    await DB.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authorizationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
    SELECT
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    From district
    WHERE
    state_id = ${stateId};`;

    const stats = await DB.get(getStateStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
