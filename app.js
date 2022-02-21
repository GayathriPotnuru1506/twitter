const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const databasePath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const validatePassword = (password) => {
  return password.length > 6;
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, password, name, gender)
     VALUES
      (
       '${username}',
       '${hashedPassword}',
       '${name}',
       '${gender}'
        
      );`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  // check user
  const userDetailsQuery = `select * from user where username = '${username}';`;
  const userDetails = await database.get(userDetailsQuery);
  if (userDetails !== undefined) {
    const isPasswordValid = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordValid) {
      //get JWT Token
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "gayathri_secret_key");
      response.send({ jwtToken }); //Scenario 3
    } else {
      response.status(400);
      response.send(`Invalid password`); //Scenario 2
    }
  } else {
    response.status(400);
    response.send("Invalid user"); //Scenario 1
  }
});
function authenticationToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers.authorization;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "gayathri_secret_key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send(`Invalid JWT Token`); // Scenario 1
      } else {
        next(); //Scenario 2
      }
    });
  } else {
    response.status(401);
    response.send(`Invalid JWT Token`); //Scenario 1
  }
}

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request.body;
    const getUserDetails = `select * from user where username='${username}';`;
    const dbUser = await database.get(getUserDetails);
    const userId = dbUser.user_id;
    const getTweetQuery = `select user.username,
    tweet.tweet,
    tweet.date_time AS dateTime
    from
    user join
    follower ON  user.user_id=follower.following_user_id
    join tweet ON follower.following_user_id=tweet.user_id
    where follower.follower_user_id=${userId}
    order by tweet.date_time DESC
    limit 4;`;
    const tweets = await database.all(getTweetQuery);
    response.send(tweets);
  }
);

app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `select * from user WHERE username='${username}';`;
  const dbUser = await database.get(getUserDetails);
  const userId = dbUser.user_id;
  const getUserFollowingQuery = `SELECT user.name 
   FROM 
   user JOIN follower
   ON user.user_id=follower.following_user_id
   WHERE follower.follower_user_id=${userId};`;
  const tweets = await database.all(getUserFollowingQuery);
  response.send(tweets);
});

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `select * from user WHERE username='${username}';`;
  const dbUser = await database.get(getUserDetails);
  const userId = dbUser.user_id;
  const getUserFollowersQuery = `SELECT user.name
  FROM user JOIN follower ON user.user_id=follower.follower_user_id
  WHERE follower.following_user_id = ${userId};`;
  const tweets = await database.all(getUserFollowersQuery);
  response.send(tweets);
});

const checkUserFollowers = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(getUserDetails);
  const userId = dbUser.user_id;
  const getTweetUserQuery = `SELECT user.username FROM user
  JOIN follower ON user.user_id = follower.following_user_id
  JOIN tweet ON follower.following_user_id = tweet.user_id
  WHERE tweet.tweet_id = ${tweetId} AND
  follower.follower_user_id = ${userId};`;
  const checkingUserFollowing = await database.get(getTweetUserQuery);
  if (heckingUserFollowing === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
    const dbUser = await database.get(getUserDetails);
    const userId = dbUser.user_id;
    const getTweetCountQuery = `SELECT tweet.tweet,
    COUNT(DISTINCT like.like_id) AS Likes,
    COUNT(Distinct reply.reply_id) AS replies,
    tweet.date_time as dateTime
    FROM
    follower JOIN tweet On follower.following_user_id=tweet.user_id
    JOIN like ON tweet.tweet_id=like.tweet_id
    JOIN reply ON tweet.tweet_id=reply.tweet_id
    WHERE tweet.tweet_id = ${tweetId}
    GROUP BY follower.follower_user_id
    HAVING follower.follower_user_id = ${userId};`;
    const tweetDetails = await database.get(getTweetCountQuery);
    response.send(tweetDetails);
  }
);

const convertingToLikeUsersToResponsive = (dbObject) => {
  arrayOfLikedUsers = [];
  for (eachObject of dbObject) {
    arrayOfLikedUsers.push(eachObject["username"]);
  }
  return { likes: arrayOfLikedUsers };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
    const dbUser = await database.get(getUserDetails);
    const userId = dbUser.user_id;
    const getTweetLikedUsersQuery = `SELECT user.username 
    FROM tweet JOIN follower ON follower.following_user_id = tweet.user_id
    JOIN like ON tweet.tweet_id=like.tweet_id
    JOIN user ON like.user_id = user.user_id
    WHERE tweet.tweet_id=${tweetId} AND 
    follower.follower_user_id=${userId};`;
    const tweetLiked = await database.all(getTweetLikedUsersQuery);
    const tweetLikedResponsiveObject = convertingToLikeUsersToResponsive(
      tweetLiked
    );
    response.send(tweetLikedResponsiveObject);
  }
);

const convertingToReplyToResponsive = (dbObject) => {
  arrayOfReplyUsers = [];
  for (eachObject of dbObject) {
    arrayOfReplyUsers.push(eachObject);
  }
  return { replies: arrayOfReplyUsers };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  checkUserFollowers,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
    const dbUser = await database.get(getUserDetails);
    const userId = dbUser.user_id;
    const getTweetReplyQuery = `SELECT user.name,
reply.reply FROM tweet JOIN reply ON tweet.tweet_id = reply.tweet_id
JOIN user ON reply.user_id = user.user_id
JOIN follower ON user.user_id = follower.following_user_id
WHERE tweet.tweet_id=${tweetId} AND 
follower.follower_user_id=${userId};`;
    const tweetReply = await database.all(getTweetReplyQuery);
    const tweetRepliedResponsiveObject = convertingToReplyToResponsive(
      tweetReply
    );
    response.send(tweetRepliedResponsiveObject);
  }
);

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(getUserDetails);
  const userId = dbUser.user_id;
  const getUserTweetsQuery = `SELECT tweet.tweet,
COUNT(DISTINCT like.like_id) as likes,
COUNT(DISTINCT reply.reply_id) as replies,
tweet.date_time AS dateTime
FROM 
tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id
LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
WHERE tweet.user_id = '${userId}'
GROUP BY tweet.tweet_id;`;
  const userTweets = await database.all(getUserTweetsQuery);
  response.send(userTweets);
});

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUserDetails = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(getUserDetails);
  const userId = dbUser.user_id;
  const postTweetQuery = `INSERT INTO tweet (tweet,user_id) VALUES('$(tweet)','$(userId)');`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

const checkTweetBelongsUser = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request;
  const checkTweetBelongsToUserQuery = `SELECT * FROM  user JOIN tweet ON user.user_id = tweet.user_id
WHERE tweet.tweet_id = ${tweetId}
AND user.username = '${username}';`;
  const userDetails = await database.get(checkTweetBelongsToUserQuery);
  if (userDetails === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  checkTweetBelongsUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const deleteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await database.run(deleteQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
