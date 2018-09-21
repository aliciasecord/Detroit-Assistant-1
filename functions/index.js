// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');

const fetch = require('node-fetch');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

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

  function permitsSingle(agent){
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

        let total = data.data.geocodeAddress.edges.map(e =>
          e.node.permitsByParcelno.totalCount
        )

        if (total[0] === 0) {
          return agent.add("This property does not currently have any building permits.")
        } else if (total[0] > 4) {
          return agent.ask(`This property has ${total} permits. There are too many to list, would you like this information texted or emailed to you?`)
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

  function trash(agent){
    const params = request.body.queryResult.parameters;
    const address = params["short_address"];
    const trash_type = params["trash_type"];
    const trashurl = 'https://apis.detroitmi.gov/waste_notifier/address/' + encodeURIComponent(address) + '/?format=json'
    return fetch(trashurl)
      .then(response => response.json())
      .then(data => {
        // // Return the date for each type of trash
        let date;
        if (trash_type === 'trash') {
          date = new Date(data.next_pickups.trash.date)
        }
        else if (trash_type === 'bulk') {
          date = new Date(data.next_pickups.bulk.date)
        }
        else if (trash_type === 'yard waste') {
          date = new Date(data.next_pickups['yard waste'].date)
        }
        else if (trash_type === 'recycling') {
          date = new Date(data.next_pickups.recycling.date)
        }

        const options = { weekday: 'long' };
        let day = date.toLocaleDateString("en-GB", options)

        console.log(data)
        return agent.add(`Your next ${trash_type} pickup is ${day}.`)

      }).catch(err => {
        agent.add(`Sorry we're taking a little loner on our side than expected. Please try again soon.`)
        return err
      });
  }

  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('trash', trash);
  intentMap.set('permits.single', permitsSingle);
  // intentMap.set('your intent name here', yourFunctionHandler);
  // intentMap.set('your intent name here', googleAssistantHandler);
  agent.handleRequest(intentMap);
});