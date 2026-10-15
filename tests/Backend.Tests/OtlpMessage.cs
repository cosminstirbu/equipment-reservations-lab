using System.Text;

namespace Backend.Tests;

// Read the public OTLP protobuf wire contract at the subprocess collector boundary.
internal sealed class OtlpMessage
{
    private readonly List<Field> fields = [];

    private OtlpMessage(byte[] bytes)
    {
        int offset = 0;
        while (offset < bytes.Length)
        {
            ulong tag = ReadInteger(bytes, ref offset);
            int number = checked((int)(tag >> 3));
            switch (tag & 7)
            {
                case 0:
                    fields.Add(new Field(number, [], ReadInteger(bytes, ref offset)));
                    break;
                case 1:
                    offset += 8;
                    break;
                case 2:
                    int length = checked((int)ReadInteger(bytes, ref offset));
                    fields.Add(new Field(number, bytes.AsSpan(offset, length).ToArray(), 0));
                    offset += length;
                    break;
                case 5:
                    offset += 4;
                    break;
                default:
                    throw new InvalidDataException("Unsupported protobuf wire type.");
            }

            if (offset > bytes.Length)
            {
                throw new InvalidDataException("Incomplete protobuf field.");
            }
        }
    }

    public static IEnumerable<OtlpMessage> Records(IEnumerable<byte[]> requests)
    {
        return requests.Select(bytes => new OtlpMessage(bytes))
            .SelectMany(request => request.Children(1))
            .SelectMany(resource => resource.Children(2))
            .SelectMany(scope => scope.Children(2));
    }

    public IEnumerable<OtlpMessage> Children(int number)
    {
        return fields.Where(field => field.Number == number).Select(field => new OtlpMessage(field.Bytes));
    }

    public byte[] Bytes(int number)
    {
        return fields.SingleOrDefault(field => field.Number == number)?.Bytes ?? [];
    }

    public string Text(int number)
    {
        return Encoding.UTF8.GetString(Bytes(number));
    }

    public ulong Integer(int number)
    {
        return fields.SingleOrDefault(field => field.Number == number)?.Integer ?? 0;
    }

    private static ulong ReadInteger(byte[] bytes, ref int offset)
    {
        ulong result = 0;
        for (int shift = 0; shift < 64 && offset < bytes.Length; shift += 7)
        {
            byte value = bytes[offset++];
            result |= (ulong)(value & 127) << shift;
            if ((value & 128) == 0)
            {
                return result;
            }
        }

        throw new InvalidDataException("Incomplete protobuf integer.");
    }

    private sealed record Field(int Number, byte[] Bytes, ulong Integer);
}
