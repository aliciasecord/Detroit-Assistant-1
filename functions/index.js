// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

// Import the Dialogflow module from the Actions on Google client library.
const {dialogflow} = require('actions-on-google');

// Import the fetch module
const fetch = require('node-fetch');

// Import the firebase-functions package for deployment.
const functions = require('firebase-functions');

// Instantiate the Dialogflow client.
const app = dialogflow({debug: true});

// Default welcome agent
app.intent('DefaultWelcomeIntent', (conv) => {
  conv.add(`Welcome to my agent!`);
})

// Default fallback agent
app.intent('DefaultFallbackIntent', (conv) => {
  conv.add(`I didn't understand. `);
  conv.add(`I'm sorry, can you try again?`);
})

// Fetch the permits API
app.intent('permits.single', singlepermitFunction);

function singlepermitFunction (conv, {short_address}) {
  // API url for permits at a single address
  const permitsurl = `https://data.detroitmi.gov/resource/but4-ky7y.json?$q=` + encodeURIComponent(short_address);
  // fetch the url
  fetch(permitsurl)
    .then (response => {response.json()})
    .then(data => {
      // Return the number of permits at the address and ask the user how to procede
      if (data.length === 1) {
        conv.add(`There is 1 permit for ${short_address}.`)
        conv.add(` Would you like more details about that permit?`)
      }
      else {
        conv.add(`There are ${data.length} permits for ${short_address}.`)
        conv.add(`Would you like more details about these permits?`)
      }
    })
    // print something if the above doesn't work
    .catch(
      conv.close(`It didn't work for ${short_address}`)
    )
}

// Array to define day of the week
let weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Fetch the trash API
app.intent('trash', (conv, {short_address, trash_type}) => {
  // API url for trash address
  const trashurl = 'https://apis.detroitmi.gov/waste_notifier/address/' + encodeURIComponent(short_address) + '/?format=json'

  // fetch the url
  fetch(trashurl)
    .then(response => {return response.json()})
    .then(data => {
      // Return the date for each type of trash
      if (trash_type === 'trash'){
        let date = new Date(data.next_pickups.trash.date)
      }
      else if (trash_type === 'bulk'){
        let date = new Date(data.next_pickups.bulk.date)
      }
      else if (trash_type === 'yard waste'){
        let date = new Date(data.next_pickups['yard waste'].date)
      }
      else if (trash_type === 'recycling'){
        let date = new Date(data.next_pickups.recycling.date)
      }
      // Not sure what to do with this else statement
      else
        {return null}

      // Turn date into day of the week
      let day = weekday[date.getDay()]

      // return day
      return day
    })
    .then(day => {
      // Use day to create response
      conv.add(`${trash_type} pickup is on ${day}.`)
      conv.add(` Would you like to sign up for reminders?`)

      // then statment has to have a return
      return day
    })
    // Print something if the above doesn't work
    .catch(conv.close(`I'm not sure ${short_address}`));
})

// Set the DialogflowApp object to handle the HTTPS POST request.
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);
