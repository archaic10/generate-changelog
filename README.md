# Generate Changelog

### Description
This action looks for the recently released version of the repository tag and checks if it meets the following:

- v1.0.0
- 1.0.0

This action too changes the package.json file version of the default branch.

### Example

```yml
uses: archaic10/generate-changelog@main
with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    path: '/src'
```
### Or

```yml
uses: archaic10/generate-changelog@main
with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```