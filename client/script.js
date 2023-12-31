let stripe
let customer
let price
let card

const priceInfo = {
  basic: {
    amount: '500',
    name: 'Basic',
    interval: 'monthly',
    currency: 'USD'
  },
  premium: {
    amount: '1000',
    name: 'Premium',
    interval: 'monthly',
    currency: 'USD'
  }
}

function stripeElements(publishableKey) {
  stripe = Stripe(publishableKey)

  if (document.getElementById('card-element')) {
    const elements = stripe.elements()

    // Card Element styles
    const style = {
      base: {
        fontSize: '16px',
        color: '#32325d',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        fontSmoothing: 'antialiased',
        '::placeholder': {
          color: '#a0aec0'
        }
      }
    }

    card = elements.create('card', { style })

    card.mount('#card-element')

    card.on('focus', () => {
      const el = document.getElementById('card-element-errors')
      el.classList.add('focused')
    })

    card.on('blur', () => {
      const el = document.getElementById('card-element-errors')
      el.classList.remove('focused')
    })

    card.on('change', (event) => {
      displayError(event)
    })
  }

  const signupForm = document.getElementById('signup-form')
  if (signupForm) {
    signupForm.addEventListener('submit', (evt) => {
      evt.preventDefault()
      changeLoadingState(true)
      // Create customer
      createCustomer().then((result) => {
        customer = result.customer

        window.location.href = `/prices.html?customerId=${customer.id}`
      })
    })
  }

  const paymentForm = document.getElementById('payment-form')
  if (paymentForm) {
    paymentForm.addEventListener('submit', (evt) => {
      evt.preventDefault()
      changeLoadingStateprices(true)

      // If a previous payment was attempted, get the lastest invoice
      const latestInvoicePaymentIntentStatus = localStorage.getItem(
        'latestInvoicePaymentIntentStatus'
      )

      if (latestInvoicePaymentIntentStatus === 'requires_payment_method') {
        const invoiceId = localStorage.getItem('latestInvoiceId')
        const isPaymentRetry = true
        // create new payment method & retry payment on invoice with new payment method
        createPaymentMethod({
          card,
          isPaymentRetry,
          invoiceId
        })
      } else {
        // create new payment method & create subscription
        createPaymentMethod({ card })
      }
    })
  }
}

function displayError(event) {
  changeLoadingStateprices(false)
  const displayError = document.getElementById('card-element-errors')
  if (event.error) {
    displayError.textContent = event.error.message
  } else {
    displayError.textContent = ''
  }
}

function createPaymentMethod({ card, isPaymentRetry, invoiceId }) {
  const params = new URLSearchParams(document.location.search.substring(1))
  const customerId = params.get('customerId')
  // Set up payment method for recurring usage
  const billingName = document.querySelector('#name').value

  const priceId = document.getElementById('priceId').innerHTML.toUpperCase()

  stripe
    .createPaymentMethod({
      type: 'card',
      card,
      billing_details: {
        name: billingName
      }
    })
    .then((result) => {
      if (result.error) {
        displayError(result.error)
      } else if (isPaymentRetry) {
        // Update the payment method and retry invoice payment
        retryInvoiceWithNewPaymentMethod(
          customerId,
          result.paymentMethod.id,
          invoiceId,
          priceId
        )
      } else {
        // Create the subscription
        createSubscription(customerId, result.paymentMethod.id, priceId)
      }
    })
}

function goToPaymentPage(priceId) {
  // Show the payment screen
  document.querySelector('#payment-form').classList.remove('hidden')

  document.getElementById('total-due-now').innerText = getFormattedAmount(
    priceInfo[priceId].amount
  )

  // Add the price selected
  document.getElementById('price-selected').innerHTML = `${
    '→ Subscribing to ' + '<span id="priceId" class="font-bold">'
  }${priceInfo[priceId].name}</span>`

  // Show which price the user selected
  if (priceId === 'premium') {
    document.querySelector('#submit-premium-button-text').innerText = 'Selected'
    document.querySelector('#submit-basic-button-text').innerText = 'Select'
  } else {
    document.querySelector('#submit-premium-button-text').innerText = 'Select'
    document.querySelector('#submit-basic-button-text').innerText = 'Selected'
  }

  // Update the border to show which price is selected
  changePriceSelection(priceId)
}

function changePrice() {
  demoChangePrice()
}

function switchPrices(newPriceIdSelected) {
  const params = new URLSearchParams(document.location.search.substring(1))
  const currentSubscribedpriceId = params.get('priceId')
  const customerId = params.get('customerId')
  const subscriptionId = params.get('subscriptionId')
  // Update the border to show which price is selected
  changePriceSelection(newPriceIdSelected)

  changeLoadingStateprices(true)

  // Retrieve the upcoming invoice to display details about
  // the price change
  retrieveUpcomingInvoice(customerId, subscriptionId, newPriceIdSelected).then(
    (upcomingInvoice) => {
      // Change the price details for price upgrade/downgrade
      // calculate if it's upgrade or downgrade
      document.getElementById(
        'current-price-subscribed'
      ).innerHTML = capitalizeFirstLetter(currentSubscribedpriceId)

      document.getElementById(
        'new-price-selected'
      ).innerText = capitalizeFirstLetter(newPriceIdSelected)

      document.getElementById('new-price-price-selected').innerText = `$${
        upcomingInvoice.amount_due / 100
      }`

      const nextPaymentAttemptDateToDisplay = getDateStringFromUnixTimestamp(
        upcomingInvoice.next_payment_attempt
      )
      document.getElementById(
        'new-price-start-date'
      ).innerHTML = nextPaymentAttemptDateToDisplay

      changeLoadingStateprices(false)
    }
  )

  if (currentSubscribedpriceId != newPriceIdSelected) {
    document.querySelector('#price-change-form').classList.remove('hidden')
  } else {
    document.querySelector('#price-change-form').classList.add('hidden')
  }
}

function confirmPriceChange() {
  const params = new URLSearchParams(document.location.search.substring(1))
  const subscriptionId = params.get('subscriptionId')
  const newPriceId = document.getElementById('new-price-selected').innerHTML

  updateSubscription(newPriceId.toUpperCase(), subscriptionId).then(
    (result) => {
      const searchParams = new URLSearchParams(window.location.search)
      searchParams.set('priceId', newPriceId.toUpperCase())
      searchParams.set('priceHasChanged', true)
      window.location.search = searchParams.toString()
    }
  )
}

function createCustomer() {
  const billingEmail = document.querySelector('#email').value

  console.log({ billingEmail })

  return fetch('/stripe/create-customer', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: billingEmail
    })
  })
    .then((response) => {
      return response.json()
    })
    .then((result) => {
      return result
    })
}

function handleCardSetupRequired({
  subscription,
  invoice,
  priceId,
  paymentMethodId
}) {
  const setupIntent = subscription.pending_setup_intent

  if (setupIntent && setupIntent.status === 'requires_action') {
    return stripe
      .confirmCardSetup(setupIntent.client_secret, {
        payment_method: paymentMethodId
      })
      .then((result) => {
        if (result.error) {
          // start code flow to handle updating the payment details
          // Display error message in your UI.
          // The card was declined (i.e. insufficient funds, card has expired, etc)
          throw result
        } else if (result.setupIntent.status === 'succeeded') {
          // There's a risk of the customer closing the window before callback
          // execution. To handle this case, set up a webhook endpoint and
          // listen to setup_intent.succeeded.
          return {
            priceId,
            subscription,
            invoice,
            paymentMethodId
          }
        }
      })
  } else {
    // No customer action needed
    return { subscription, priceId, paymentMethodId }
  }
}

function handlePaymentThatRequiresCustomerAction({
  subscription,
  invoice,
  priceId,
  paymentMethodId,
  isRetry
}) {
  // If it's a first payment attempt, the payment intent is on the subscription latest invoice.
  // If it's a retry, the payment intent will be on the invoice itself.
  const paymentIntent = invoice
    ? invoice.payment_intent
    : subscription.latest_invoice.payment_intent

  if (!paymentIntent) {
    return { subscription, priceId, paymentMethodId }
  }

  if (
    paymentIntent.status === 'requires_action' ||
    (isRetry === true && paymentIntent.status === 'requires_payment_method')
  ) {
    return stripe
      .confirmCardPayment(paymentIntent.client_secret, {
        payment_method: paymentMethodId
      })
      .then((result) => {
        if (result.error) {
          // start code flow to handle updating the payment details
          // Display error message in your UI.
          // The card was declined (i.e. insufficient funds, card has expired, etc)
          throw result
        } else if (result.paymentIntent.status === 'succeeded') {
          // There's a risk of the customer closing the window before callback
          // execution. To handle this case, set up a webhook endpoint and
          // listen to invoice.paid. This webhook endpoint returns an Invoice.
          return {
            priceId,
            subscription,
            invoice,
            paymentMethodId
          }
        }
      })
  } else {
    // No customer action needed
    return { subscription, priceId, paymentMethodId }
  }
}

function handleRequiresPaymentMethod({
  subscription,
  paymentMethodId,
  priceId
}) {
  if (subscription.status === 'active') {
    // subscription is active, no customer actions required.
    return { subscription, priceId, paymentMethodId }
  } else if (
    subscription.latest_invoice.payment_intent.status ===
    'requires_payment_method'
  ) {
    // Using localStorage to store the state of the retry here
    // (feel free to replace with what you prefer)
    // Store the latest invoice ID and status
    localStorage.setItem('latestInvoiceId', subscription.latest_invoice.id)
    localStorage.setItem(
      'latestInvoicePaymentIntentStatus',
      subscription.latest_invoice.payment_intent.status
    )
    throw { error: { message: 'Your card was declined.' } }
  } else {
    return { subscription, priceId, paymentMethodId }
  }
}

function onSubscriptionComplete(result) {
  console.log(result)
  // Payment was successful. Provision access to your service.
  // Remove invoice from localstorage because payment is now complete.
  clearCache()
  // Change your UI to show a success message to your customer.
  onSubscriptionSampleDemoComplete(result)
  // Call your backend to grant access to your service based on
  // the product your customer subscribed to.
  // Get the product by using result.subscription.price.product
}

function createSubscription(customerId, paymentMethodId, priceId) {
  return (
    fetch('/create-subscription', {
      method: 'post',
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({
        customerId,
        paymentMethodId,
        priceId
      })
    })
      .then((response) => {
        return response.json()
      })
      // If the card is declined, display an error to the user.
      .then((result) => {
        if (result.error) {
          // The card had an error when trying to attach it to a customer
          throw result
        }
        return result
      })
      // Normalize the result to contain the object returned
      // by Stripe. Add the addional details we need.
      .then((result) => {
        return {
          // Use the Stripe 'object' property on the
          // returned result to understand what object is returned.
          subscription: result,
          paymentMethodId,
          priceId
        }
      })
      // Some payment methods require a customer to do additional
      // authentication with their financial institution.
      // Eg: 2FA for cards.
      .then(handleCardSetupRequired)
      .then(handlePaymentThatRequiresCustomerAction)
      // If attaching this card to a Customer object succeeds,
      // but attempts to charge the customer fail. You will
      // get a requires_payment_method error.
      .then(handleRequiresPaymentMethod)
      // No more actions required. Provision your service for the user.
      .then(onSubscriptionComplete)
      .catch((error) => {
        // An error has happened. Display the failure to the user here.
        // We utilize the HTML element we created.
        displayError(error)
      })
  )
}

function retryInvoiceWithNewPaymentMethod(
  customerId,
  paymentMethodId,
  invoiceId,
  priceId
) {
  return (
    fetch('/retry-invoice', {
      method: 'post',
      headers: {
        'Content-type': 'application/json'
      },
      body: JSON.stringify({
        customerId,
        paymentMethodId,
        invoiceId
      })
    })
      .then((response) => {
        return response.json()
      })
      // If the card is declined, display an error to the user.
      .then((result) => {
        if (result.error) {
          // The card had an error when trying to attach it to a customer
          throw result
        }
        return result
      })
      // Normalize the result to contain the object returned
      // by Stripe. Add the addional details we need.
      .then((result) => {
        return {
          // Use the Stripe 'object' property on the
          // returned result to understand what object is returned.
          invoice: result,
          paymentMethodId,
          priceId,
          isRetry: true
        }
      })
      // Some payment methods require a customer to be on session
      // to complete the payment process. Check the status of the
      // payment intent to handle these actions.
      .then(handlePaymentThatRequiresCustomerAction)
      // No more actions required. Provision your service for the user.
      .then(onSubscriptionComplete)
      .catch((error) => {
        // An error has happened. Display the failure to the user here.
        // We utilize the HTML element we created.
        displayError(error)
      })
  )
}

function retrieveUpcomingInvoice(customerId, subscriptionId, newPriceId) {
  return fetch('/retrieve-upcoming-invoice', {
    method: 'post',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
      customerId,
      subscriptionId,
      newPriceId
    })
  })
    .then((response) => {
      return response.json()
    })
    .then((invoice) => {
      return invoice
    })
}

function cancelSubscription() {
  changeLoadingStateprices(true)
  const params = new URLSearchParams(document.location.search.substring(1))
  const subscriptionId = params.get('subscriptionId')

  return fetch('/cancel-subscription', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subscriptionId
    })
  })
    .then((response) => {
      return response.json()
    })
    .then((cancelSubscriptionResponse) => {
      return subscriptionCancelled(cancelSubscriptionResponse)
    })
}

function updateSubscription(priceId, subscriptionId) {
  return fetch('/update-subscription', {
    method: 'post',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
      subscriptionId,
      newPriceId: priceId
    })
  })
    .then((response) => {
      return response.json()
    })
    .then((response) => {
      return response
    })
}

function retrieveCustomerPaymentMethod(paymentMethodId) {
  return fetch('/retrieve-customer-payment-method', {
    method: 'post',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
      paymentMethodId
    })
  })
    .then((response) => {
      return response.json()
    })
    .then((response) => {
      return response
    })
}

function getConfig() {
  return fetch('/config', {
    method: 'get',
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then((response) => {
      return response.json()
    })
    .then((response) => {
      // Set up Stripe Elements
      stripeElements(response.publishableKey)
    })
}

getConfig()

/* ------ Sample helpers ------- */

function getFormattedAmount(amount) {
  // Format price details and detect zero decimal currencies
  var amount = amount
  const numberFormat = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'symbol'
  })
  const parts = numberFormat.formatToParts(amount)
  let zeroDecimalCurrency = true
  for (const part of parts) {
    if (part.type === 'decimal') {
      zeroDecimalCurrency = false
    }
  }
  amount = zeroDecimalCurrency ? amount : amount / 100
  const formattedAmount = numberFormat.format(amount)

  return formattedAmount
}

function capitalizeFirstLetter(string) {
  const tempString = string.toLowerCase()
  return tempString.charAt(0).toUpperCase() + tempString.slice(1)
}

function getDateStringFromUnixTimestamp(date) {
  const nextPaymentAttemptDate = new Date(date * 1000)
  const day = nextPaymentAttemptDate.getDate()
  const month = nextPaymentAttemptDate.getMonth() + 1
  const year = nextPaymentAttemptDate.getFullYear()

  return `${month}/${day}/${year}`
}

// For demo purpose only
function getCustomersPaymentMethod() {
  const params = new URLSearchParams(document.location.search.substring(1))

  const paymentMethodId = params.get('paymentMethodId')
  if (paymentMethodId) {
    retrieveCustomerPaymentMethod(paymentMethodId).then((response) => {
      document.getElementById(
        'credit-card-last-four'
      ).innerText = `${capitalizeFirstLetter(response.card.brand)} •••• ${
        response.card.last4
      }`

      document.getElementById(
        'subscribed-price'
      ).innerText = capitalizeFirstLetter(params.get('priceId'))
    })
  }
}

getCustomersPaymentMethod()

// Shows the cancellation response
function subscriptionCancelled() {
  document.querySelector('#subscription-cancelled').classList.remove('hidden')
  document.querySelector('#subscription-settings').classList.add('hidden')
}

/* Shows a success / error message when the payment is complete */
function onSubscriptionSampleDemoComplete({
  priceId,
  subscription,
  paymentMethodId,
  invoice
}) {
  let subscriptionId
  let currentPeriodEnd
  let customerId
  if (subscription) {
    subscriptionId = subscription.id
    currentPeriodEnd = subscription.current_period_end
    if (typeof subscription.customer === 'object') {
      customerId = subscription.customer.id
    } else {
      customerId = subscription.customer
    }
  } else {
    const params = new URLSearchParams(document.location.search.substring(1))
    subscriptionId = invoice.subscription
    currentPeriodEnd = params.get('currentPeriodEnd')
    customerId = invoice.customer
  }

  window.location.href = `/account.html?subscriptionId=${subscriptionId}&priceId=${priceId}&currentPeriodEnd=${currentPeriodEnd}&customerId=${customerId}&paymentMethodId=${paymentMethodId}`
}

function demoChangePrice() {
  document.querySelector('#basic').classList.remove('border-pasha')
  document.querySelector('#premium').classList.remove('border-pasha')
  document.querySelector('#price-change-form').classList.add('hidden')

  // Grab the priceId from the URL
  // This is meant for the demo, replace with a cache or database.
  const params = new URLSearchParams(document.location.search.substring(1))
  const priceId = params.get('priceId').toLowerCase()

  // Show the change price screen
  document.querySelector('#prices-form').classList.remove('hidden')
  document
    .querySelector(`#${priceId.toLowerCase()}`)
    .classList.add('border-pasha')

  const elements = document.querySelectorAll(`#submit-${priceId}-button-text`)
  for (let i = 0; i < elements.length; i++) {
    elements[0].childNodes[3].innerText = 'Current'
  }
  if (priceId === 'premium') {
    document.getElementById('submit-premium').disabled = true
    document.getElementById('submit-basic').disabled = false
  } else {
    document.getElementById('submit-premium').disabled = false
    document.getElementById('submit-basic').disabled = true
  }
}

// Changes the price selected
function changePriceSelection(priceId) {
  document.querySelector('#basic').classList.remove('border-pasha')
  document.querySelector('#premium').classList.remove('border-pasha')
  document
    .querySelector(`#${priceId.toLowerCase()}`)
    .classList.add('border-pasha')
}

// Show a spinner on subscription submission
function changeLoadingState(isLoading) {
  if (isLoading) {
    document.querySelector('#button-text').classList.add('hidden')
    document.querySelector('#loading').classList.remove('hidden')
    document.querySelector('#signup-form button').disabled = true
  } else {
    document.querySelector('#button-text').classList.remove('hidden')
    document.querySelector('#loading').classList.add('hidden')
    document.querySelector('#signup-form button').disabled = false
  }
}

// Show a spinner on subscription submission
function changeLoadingStateprices(isLoading) {
  if (isLoading) {
    document.querySelector('#button-text').classList.add('hidden')
    document.querySelector('#loading').classList.remove('hidden')

    document.querySelector('#submit-basic').classList.add('invisible')
    document.querySelector('#submit-premium').classList.add('invisible')
    if (document.getElementById('confirm-price-change-cancel')) {
      document
        .getElementById('confirm-price-change-cancel')
        .classList.add('invisible')
    }
  } else {
    document.querySelector('#button-text').classList.remove('hidden')
    document.querySelector('#loading').classList.add('hidden')

    document.querySelector('#submit-basic').classList.remove('invisible')
    document.querySelector('#submit-premium').classList.remove('invisible')
    if (document.getElementById('confirm-price-change-cancel')) {
      document
        .getElementById('confirm-price-change-cancel')
        .classList.remove('invisible')
      document
        .getElementById('confirm-price-change-submit')
        .classList.remove('invisible')
    }
  }
}

function clearCache() {
  localStorage.clear()
}

function resetDemo() {
  clearCache()
  window.location.href = '/'
}
