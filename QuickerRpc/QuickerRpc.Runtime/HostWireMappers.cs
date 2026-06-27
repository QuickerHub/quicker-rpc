using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

/// <summary>Maps host port write results to legacy wire DTOs.</summary>
internal static class HostWireMappers
{
    public static QuickerRpcApplyXActionResult ToApplyXActionResult(QuickerRpcActionProgramWriteResult write) =>
        write.Success
            ? new QuickerRpcApplyXActionResult
            {
                Success = true,
                ActionId = write.ActionId,
                EditVersion = write.EditVersion,
            }
            : write.VersionConflict
                ? new QuickerRpcApplyXActionResult
                {
                    Success = false,
                    ActionId = write.ActionId,
                    EditVersion = write.EditVersion,
                    VersionConflict = true,
                    ErrorMessage = write.ErrorMessage,
                }
                : new QuickerRpcApplyXActionResult
                {
                    Success = false,
                    ActionId = write.ActionId,
                    ErrorMessage = write.ErrorMessage,
                };

    public static QuickerRpcUpdateActionMetadataResult ToUpdateMetadataResult(QuickerRpcActionProgramWriteResult write) =>
        write.Success
            ? new QuickerRpcUpdateActionMetadataResult
            {
                Success = true,
                ActionId = write.ActionId,
                EditVersion = write.EditVersion,
                UpdatedUtc = System.DateTimeOffset.UtcNow.ToString("o"),
            }
            : write.VersionConflict
                ? new QuickerRpcUpdateActionMetadataResult
                {
                    Success = false,
                    ActionId = write.ActionId,
                    EditVersion = write.EditVersion,
                    VersionConflict = true,
                    ErrorMessage = write.ErrorMessage,
                }
                : new QuickerRpcUpdateActionMetadataResult
                {
                    Success = false,
                    ActionId = write.ActionId,
                    ErrorMessage = write.ErrorMessage,
                };

    public static QuickerRpcApplySubProgramPatchResult ToApplySubProgramResult(QuickerRpcSubProgramWriteResult write) =>
        write.Success
            ? new QuickerRpcApplySubProgramPatchResult
            {
                Success = true,
                SubProgramId = write.SubProgramId ?? write.IdOrName,
                EditVersion = write.EditVersion,
            }
            : write.VersionConflict
                ? new QuickerRpcApplySubProgramPatchResult
                {
                    Success = false,
                    SubProgramId = write.SubProgramId ?? write.IdOrName,
                    EditVersion = write.EditVersion,
                    VersionConflict = true,
                    ErrorMessage = write.ErrorMessage,
                }
                : new QuickerRpcApplySubProgramPatchResult
                {
                    Success = false,
                    SubProgramId = write.SubProgramId ?? write.IdOrName,
                    ErrorMessage = write.ErrorMessage,
                };

    public static QuickerRpcCreateSubProgramResult ToCreateSubProgramResult(QuickerRpcSubProgramWriteResult write) =>
        write.Success
            ? new QuickerRpcCreateSubProgramResult
            {
                Ok = true,
                Message = write.Message ?? "公共子程序已创建。",
                SubProgramId = write.SubProgramId,
                Name = write.Name ?? write.IdOrName,
                CallIdentifier = write.CallIdentifier,
                EditVersion = write.EditVersion,
            }
            : new QuickerRpcCreateSubProgramResult
            {
                Ok = false,
                Message = write.ErrorMessage ?? "Create failed.",
                Name = write.IdOrName,
            };

    public static QuickerRpcActionUpdateResult ToActionUpdateResult(QuickerRpcHostMutationResult mutation) =>
        new()
        {
            Ok = mutation.Success,
            ActionId = mutation.EntityId,
            Message = mutation.Message,
        };
}
