const twilio = require("twilio");

const normalizePhoneNumber = (value) => {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith("+")) {
    return `+${rawValue.slice(1).replace(/\D/g, "")}`;
  }

  const digitsOnly = rawValue.replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.startsWith("00")) {
    return `+${digitsOnly.slice(2)}`;
  }

  if (digitsOnly.length === 10) {
    const defaultCountryCode = String(
      process.env.SMS_DEFAULT_COUNTRY_CODE || "+91"
    ).trim();
    return `${defaultCountryCode}${digitsOnly}`;
  }

  if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
    return `+${digitsOnly}`;
  }

  return rawValue;
};

const getSmsClient = () => {
  const accountSid = String(process.env.SMS_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.SMS_AUTH_TOKEN || "").trim();

  if (!accountSid || !authToken) {
    throw new Error("SMS provider credentials are not configured");
  }

  return twilio(accountSid, authToken);
};

const sendSms = async ({ to, body }) => {
  const client = getSmsClient();
  const from = normalizePhoneNumber(process.env.SMS_FROM);
  const normalizedRecipient = normalizePhoneNumber(to);

  if (!from) {
    throw new Error("SMS sender number is not configured");
  }

  if (!normalizedRecipient) {
    throw new Error("Recipient phone number is invalid");
  }

  const result = await client.messages.create({
    body,
    from,
    to: normalizedRecipient,
  });

  return result;
};

module.exports = { sendSms, normalizePhoneNumber };
