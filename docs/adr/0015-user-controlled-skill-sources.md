# 支持用户控制的 Skill Source

V1 支持所有 APP 能够安装或读取的 Skill Source，包括内置包、本地目录或压缩包、npm/npx 包、Git URL 以及后续新增的安装适配器。APP 不对来源建立强制白名单，也不替用户完成安全背书；安装前仍展示来源、版本、依赖和权限，并要求用户明确确认。这样用户可以直接复用现有生态中的 Skill，而来源可信性、依赖风险和权限判断由用户承担。

## Status

accepted

## Consequences

- Skill installer 必须将安装来源和解析结果记录到 Installed Skill 的 metadata 中。
- `npx`/npm 安装可能执行包生命周期脚本，必须在 Data Transfer Notice/Approval Gate 中明确提示其本地执行风险。
- 后续可以增加签名、审核或组织策略，但不能把这些可选治理能力误写成 V1 的安装前提。
