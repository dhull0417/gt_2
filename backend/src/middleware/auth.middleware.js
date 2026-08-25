export const protectRoute = async (req, res, next) => {
  const auth = req.auth();
  if (!auth.isAuthenticated) {
    console.error("Auth rejected:", auth.reason, auth.message);
    return res.status(401).json({ message: "Unauthorized - you must be logged in" });
  }
  next();
};