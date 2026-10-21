/** Static export: the whole app runs client-side (model simulator + public RPC reads). */
export default { output: "export", images: { unoptimized: true }, transpilePackages: ["@v2r/model"] };
