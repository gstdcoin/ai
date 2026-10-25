declare module '*.open-next/worker.js' {
    interface OpenNextWorker {
        fetch(request: Request, env: Record<string, unknown>, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response>;
    }

    const worker: OpenNextWorker;
    export default worker;
}
