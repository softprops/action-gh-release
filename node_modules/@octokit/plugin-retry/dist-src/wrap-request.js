// @ts-ignore
import Bottleneck from "bottleneck/light";
// @ts-ignore
export async function wrapRequest(state, request, options) {
    const limiter = new Bottleneck();
    // @ts-ignore
    limiter.on("failed", function (error, info) {
        const maxRetries = ~~error.request.request.retries;
        const after = ~~error.request.request.retryAfter;
        options.request.retryCount = info.retryCount + 1;
        if (maxRetries > info.retryCount) {
            // Returning a number instructs the limiter to retry
            // the request after that number of milliseconds have passed
            return after * state.retryAfterBaseValue;
        }
    });
    return limiter.schedule(request, options);
}
