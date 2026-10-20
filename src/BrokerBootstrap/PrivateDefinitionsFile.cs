using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace BrokerBootstrap;

internal static partial class PrivateDefinitionsFile
{
    private const uint PrivateRegularMode = 0x8180;
    private const uint RequiredStatxFields = 0x20f; // STATX_TYPE | MODE | NLINK | UID | SIZE.
    private const int AtEmptyPath = 0x1000;
    private const int LinuxArm64NoFollow = 0x8000;
    private const int LinuxX64NoFollow = 0x20000;
    private const int LinuxNonBlocking = 0x800;
    private const int LinuxCloseOnExec = 0x80000;
    private const int DarwinNoFollow = 0x100;
    private const int DarwinNonBlocking = 0x4;
    private const int DarwinCloseOnExec = 0x1000000;

    public static void Publish(string output, string definitions)
    {
        if ((!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
            || RuntimeInformation.ProcessArchitecture is not (Architecture.Arm64 or Architecture.X64))
        {
            throw new PlatformNotSupportedException("Secure definitions require a supported Unix platform.");
        }

        byte[] expected = Encoding.UTF8.GetBytes(definitions);
        string temporary = Path.Combine(Path.GetDirectoryName(output)!, ".definitions-" + Guid.NewGuid().ToString("N"));
        try
        {
            var options = new FileStreamOptions
            {
                Mode = FileMode.CreateNew,
                Access = FileAccess.Write,
                Share = FileShare.None,
                UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite
            };
            using (var file = new FileStream(temporary, options))
            {
                file.Write(expected);
                file.Flush(flushToDisk: true);
            }

            try
            {
                File.Move(temporary, output, overwrite: false);
            }
            catch (IOException)
            {
                VerifyExisting(output, expected);
            }
        }
        finally
        {
            File.Delete(temporary);
        }
    }

    private static void VerifyExisting(string output, byte[] expected)
    {
        int linuxNoFollow = RuntimeInformation.ProcessArchitecture == Architecture.Arm64 ? LinuxArm64NoFollow : LinuxX64NoFollow;
        int flags = OperatingSystem.IsLinux()
            ? linuxNoFollow | LinuxNonBlocking | LinuxCloseOnExec
            : DarwinNoFollow | DarwinNonBlocking | DarwinCloseOnExec;
        int descriptor = Open(output, flags);
        if (descriptor < 0)
        {
            throw new IOException("Existing definitions could not be securely opened.");
        }

        using var handle = new SafeFileHandle(descriptor, ownsHandle: true);
        VerifyMetadata(handle, expected.Length);
        byte[] actual = new byte[expected.Length];
        int read = 0;
        while (read < actual.Length)
        {
            int count = RandomAccess.Read(handle, actual.AsSpan(read), read);
            if (count == 0)
            {
                throw new IOException("Existing definitions are incomplete.");
            }

            read += count;
        }

        if (!actual.AsSpan().SequenceEqual(expected))
        {
            throw new IOException("Existing definitions do not match the configured authority.");
        }

        VerifyMetadata(handle, expected.Length);
    }

    private static void VerifyMetadata(SafeFileHandle handle, int expectedSize)
    {
        uint mode;
        uint owner;
        uint links;
        ulong size;
        if (OperatingSystem.IsLinux())
        {
            if (Statx(handle, "", AtEmptyPath, RequiredStatxFields, out LinuxStatus status) != 0
                || (status.Mask & RequiredStatxFields) != RequiredStatxFields)
            {
                throw new IOException("Definitions metadata could not be verified.");
            }

            mode = status.Mode;
            owner = status.UserId;
            links = status.LinkCount;
            size = status.Size;
        }
        else
        {
            int result = RuntimeInformation.ProcessArchitecture == Architecture.Arm64
                ? DarwinStat(handle, out DarwinStatus status)
                : DarwinStatInode64(handle, out status);
            if (result != 0 || status.Size < 0)
            {
                throw new IOException("Definitions metadata could not be verified.");
            }

            mode = status.Mode;
            owner = status.UserId;
            links = status.LinkCount;
            size = (ulong)status.Size;
        }

        if (mode != PrivateRegularMode || owner != EffectiveUserId() || links != 1 || size != (ulong)expectedSize)
        {
            throw new IOException("Existing definitions are not a complete private owned regular file.");
        }
    }

    [LibraryImport("libc", EntryPoint = "open", StringMarshalling = StringMarshalling.Utf8, SetLastError = true)]
    private static partial int Open(string path, int flags);

    [LibraryImport("libc", EntryPoint = "geteuid")]
    private static partial uint EffectiveUserId();

    [LibraryImport("libc", EntryPoint = "statx", StringMarshalling = StringMarshalling.Utf8, SetLastError = true)]
    private static partial int Statx(SafeFileHandle descriptor, string path, int flags, uint mask, out LinuxStatus status);

    [LibraryImport("libc", EntryPoint = "fstat", SetLastError = true)]
    private static partial int DarwinStat(SafeFileHandle descriptor, out DarwinStatus status);

    [LibraryImport("libc", EntryPoint = "fstat$INODE64", SetLastError = true)]
    private static partial int DarwinStatInode64(SafeFileHandle descriptor, out DarwinStatus status);

    // Linux UAPI statx has a stable 256-byte ABI; only its documented prefix is consumed.
    [StructLayout(LayoutKind.Sequential, Size = 256)]
    private struct LinuxStatus
    {
        public uint Mask;
        public uint BlockSize;
        public ulong Attributes;
        public uint LinkCount;
        public uint UserId;
        public uint GroupId;
        public ushort Mode;
        public ushort Spare;
        public ulong Inode;
        public ulong Size;
    }

    // Apple's __DARWIN_STRUCT_STAT64 uses this full layout for supported 64-bit processes.
    [StructLayout(LayoutKind.Sequential)]
    private struct DarwinStatus
    {
        public int Device;
        public ushort Mode;
        public ushort LinkCount;
        public ulong Inode;
        public uint UserId;
        public uint GroupId;
        public int RawDevice;
        public DarwinTimestamp Accessed;
        public DarwinTimestamp Modified;
        public DarwinTimestamp Changed;
        public DarwinTimestamp Created;
        public long Size;
        public long Blocks;
        public int BlockSize;
        public uint Flags;
        public uint Generation;
        public int Spare;
        public long Reserved1;
        public long Reserved2;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DarwinTimestamp
    {
        public long Seconds;
        public long Nanoseconds;
    }
}
