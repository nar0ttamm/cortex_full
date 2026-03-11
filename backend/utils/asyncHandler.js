/**
 * Wraps an async Express route handler so thrown errors are passed to next()
 * instead of causing unhandled promise rejections.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
