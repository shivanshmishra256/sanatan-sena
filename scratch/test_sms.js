// Native fetch used in Node 24

const FAST2SMS_API_KEY = "rV8LDl0NmOwFoH1ydkIXxnZEYbUTRMfa3Qu2zcev5iSpjqh7BgjmWsRawLncMkKrHpA0GViShXyv5dgf";
const otp = "123456";
const numbers = "6388818343";

async function testSMS() {
  // Trying 'v3' route which is standard message
  const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=v3&sender_id=FT2SMS&message=Your OTP is ${otp}&language=english&flash=0&numbers=${numbers}`;
  console.log("Testing URL:", url);
  
  try {
    const response = await fetch(url);
    const result = await response.json();
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

testSMS();
