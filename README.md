# simple-s3-browser

A small TUI browser for an S3-compatible bucket. Built with [OpenTUI](https://opentui.com) and Bun's built-in `S3Client`.

```bash
bun start
bun start photos/summer/
bun start --bucket my-bucket --endpoint http://127.0.0.1:9000
```

Credentials and the default bucket come from the environment (`S3_*` or `AWS_*`), or from `--bucket` / `--endpoint` / `--region`.

| Key               | Action                                 |
| ----------------- | -------------------------------------- |
| `↑` `↓` / `j` `k` | Move                                   |
| `enter` / `l`     | Open folder or file                    |
| `backspace` / `h` | Parent folder                          |
| `/`               | Filter                                 |
| `d`               | Download file to the current directory |
| `u`               | Show a 1-hour presigned URL            |
| `r`               | Reload                                 |
| `q`               | Quit                                   |
