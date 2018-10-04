// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');
const admin = require('firebase-admin');

// Networking
const fetch = require('node-fetch');

// Setup firestore connections
admin.initializeApp(functions.config().firebase);
var db = admin.firestore();

// enables lib debugging statements
process.env.DEBUG = 'dialogflow:debug'; 

const checkUserStatus = () => {
  /* Check if the current session 
     user already has any saved details 
     on the system 
  */
}

const checkIntentSource = (request) => {
  // Requests from dialog flow web interface do not come with a intent source
  // At some point we should return the entire user payload for storage
  const source = request.body.originalDetectIntentRequest.source || "debug"
  let userId;
  if (source === "twilio") {
    userId = request.body.originalDetectIntentRequest.payload.data.From
  } else if (source === "google") {
    userId = request.body.originalDetectIntentRequest.payload.user.userId
  }else{
    console.log("Debug user")
    userId = "6435"
  }
  return { source, userId}
}

// If there is a user, checkUserExistance payload contains the user data for use
// Or false if no user is found
// Returns the entire promise so you can access the data for other intents
const checkUserExistance = (request) => {
  const user = checkIntentSource(request);
  var userRef = db.collection('users').doc(`${user.userId}`);
  var getDoc = userRef.get()
    .then(doc => {
      if (!doc.exists) {
        console.log('No such document!');
        return false
      } else {
        console.log('Document data:', doc.data());
        return doc.data()
      }
    })
    .catch(err => {
      console.log('Error getting document', err);
      return false
    });
  return getDoc
}

const createNewUser = (request) => {
  const newUser = checkIntentSource(request)
  console.log("User details:", newUser)
  var docRef = db.collection('users').doc(`${newUser.userId}`);
  var setUser = docRef.set({
    userId: newUser.userId
  });
  /* Save a new record for the user
     either a phone number or google assistant code
  */
}

const getUserDetails = (userId) => {
  // Return the user details for use in an intent
  // This is actually covered with checkUserExistance but you may want to do it directly
  // We may also want to maintain single responsibility
}

const updateUserDetails = (userId, details) => {
  // Write items to the user file such as phone and email 
}

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }

  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }

  function trash(agent) {
    const params = request.body.queryResult.parameters;
    const address = params["short_address"];
    const trash_type = params["trash_type"];
    const trashurl = 'https://apis.detroitmi.gov/waste_notifier/address/' + encodeURIComponent(address) + '/?format=json'
    return fetch(trashurl)
      .then(response => response.json())
      .then(data => {
        // // Return the date for each type of trash
        const date = new Date(data.next_pickups[trash_type].date)
        const todays_date = new Date().getDate()
        const options = { weekday: 'long' };
        const day = date.toLocaleDateString("en-GB", options)

        // TODO: Check if hours are past 10 and tell the "Next xDay"
        if (date.getDate() === todays_date) {
          return agent.add(`Your next ${trash_type} pickup is today.`)
        } else {
          return agent.add(`Your next ${trash_type} pickup is ${day}.`)
        }

      }).catch(err => {
        agent.add(`Sorry we're taking a little longer on our side than expected. Please try again soon.`)
        console.log("Error:", err)
        return err
      });
  }

  function permitsDetails(agent){
    const propertyContext = agent.getContext('permitstosend').parameters.permits;
    return agent.add(`So there were ${propertyContext.totalCount} permits in your last request.`)
  }

  

  function permitsSingle(agent){
    //createNewUser(request)
    checkUserExistance(request).then(response => console.log("From the promise:",response)).catch(err => console.log(err))
    
    const params = request.body.queryResult.parameters;
    const address = params["short_address"];

    const gqlEndpoint = `https://detroit-opendata.ngrok.io/graphql`
    const gqlQuery = `{
          geocodeAddress(address: "${address}") {
            edges {
              node {
                parcelno
                address
                wkbGeometry
                permitsByParcelno {
                  totalCount
                  edges {
                    node {
                      permitNo
                      bldPermitType
                    }
                  }
                }
              }
            }
          }
        }`;

    return fetch(gqlEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/graphql' },
      body: gqlQuery,
    })
      .then(res => res.json())
      .then(data => {
        console.log("permit Data", data);
        let total = data.data.geocodeAddress.edges.map(e =>
          e.node.permitsByParcelno.totalCount
        )

        if (total[0] === 0) {
          return agent.add("This property does not currently have any building permits.")
        } else if (total[0] > 4) {
          agent.setContext({
            name: 'permitstosend',
            lifespan: 2,
            parameters: { permits: data.data.geocodeAddress.edges[0].node.permitsByParcelno }
          })
          agent.add(`This property has ${total} permits. There are too many to list, would you like this information texted or emailed to you?`)
          return agent.add(new Suggestion("Yes"))
        } else {

          const nodes = data.data.geocodeAddress.edges;

          let permitResponses = ""
          for (let node of nodes) {
            for (let newNode of node.node.permitsByParcelno.edges) {
              permitResponses += `Number: ${newNode.node.permitNo}, Type: ${newNode.node.bldPermitType}.`
            }
          }
          agent.add(`This property has ${total} permits. They are as follows:`)
          return agent.add(permitResponses)
        }

      }

      )
      .catch(e => console.log(e));
  }

  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('trash', trash);
  intentMap.set('permits.single', permitsSingle);
  intentMap.set('permits.single - yes', permitsDetails);
  agent.handleRequest(intentMap);
});