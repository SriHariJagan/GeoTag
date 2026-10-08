export const decodeToken = (token) => {
  try {
    if (!token) return null;

    const base64Payload = token.split(".")[1];
    if (!base64Payload) return null;

    const payload = JSON.parse(atob(base64Payload));

    return payload;
  } catch (error) {
    console.error("Invalid JWT:", error);
    return null;
  }
};
