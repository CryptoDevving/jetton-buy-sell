export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomInRange(min: number, max: number) {
    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    return result;
}