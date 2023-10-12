module.exports = {
  client: {
    includes: ["app/**/*.{ts,tsx,js,jsx,graphql}"],
    service: {
      name: `galoy`,
      url: `http://development.flashapp.me:4000/graphql`,
    },
  },
}
