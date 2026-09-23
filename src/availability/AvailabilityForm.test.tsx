import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AvailabilityForm from "./AvailabilityForm";

const catalog = [
  {
    id: "coca-cola",
    brand: "Coca-Cola",
    name: "Cola",
    flavor: "Original",
    aliases: ["Coke"],
  },
  {
    id: "pepsi-cola",
    brand: "Pepsi-Cola",
    name: "Cola",
    flavor: "Original",
    aliases: ["Coke"],
  },
];

describe("AvailabilityForm", () => {
  it("shows ambiguous aliases and submits only an explicitly selected soda id", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<AvailabilityForm onAdd={onAdd} loadCatalog={vi.fn().mockResolvedValue(catalog)} />);

    const input = await screen.findByLabelText("Catalog soda");
    await user.type(input, "Coke");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Coca-Cola Cola — Original");
    expect(options[1]).toHaveTextContent("Pepsi-Cola Cola — Original");
    expect(onAdd).not.toHaveBeenCalled();

    await user.click(options[1]!);
    await user.click(screen.getByLabelText("Form"));
    await user.click(screen.getByRole("option", { name: "Bottle" }));
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(catalog[1], "bottle"));
  });

  it("keeps exact IDs distinct when catalog labels are identical", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const duplicateLabels = [
      { id: "cola-one", brand: "Cola Co", name: "Cola", flavor: "Original" },
      { id: "cola-two", brand: "Cola Co", name: "Cola", flavor: "Original" },
    ];
    render(
      <AvailabilityForm onAdd={onAdd} loadCatalog={vi.fn().mockResolvedValue(duplicateLabels)} />,
    );

    const input = await screen.findByLabelText("Catalog soda");
    await user.click(input);
    const options = await screen.findAllByRole("option", {
      name: "Cola Co Cola — Original",
    });
    expect(options).toHaveLength(2);
    await user.click(options[1]!);
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(duplicateLabels[1], "can"));
  });

  it("rejects a stale selection after its displayed text is edited", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AvailabilityForm onAdd={onAdd} loadCatalog={vi.fn().mockResolvedValue(catalog)} />);

    const input = await screen.findByLabelText("Catalog soda");
    await user.click(input);
    await user.click((await screen.findAllByRole("option"))[0]!);
    await user.type(input, " Zero");
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    expect(screen.getByText("Choose a catalog soda or add a new one.")).toBeVisible();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("locks the selection while an availability write is pending", async () => {
    const user = userEvent.setup();
    let finish: (() => void) | undefined;
    const onAdd = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<AvailabilityForm onAdd={onAdd} loadCatalog={vi.fn().mockResolvedValue(catalog)} />);

    const input = await screen.findByLabelText("Catalog soda");
    await user.click(input);
    await user.click((await screen.findAllByRole("option"))[0]!);
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    expect(input).toBeDisabled();
    expect(screen.getByLabelText("Form")).toHaveAttribute("aria-disabled", "true");
    finish?.();
    await screen.findByText("Availability added.");
  });

  it("creates an unmatched soda and reuses it for another form", async () => {
    const user = userEvent.setup();
    const created = {
      id: "sprecher-root-beer",
      brand: "Sprecher",
      name: "Root Beer",
      flavor: "Original",
    };
    const onAdd = vi.fn().mockResolvedValue(created);
    render(<AvailabilityForm onAdd={onAdd} loadCatalog={vi.fn().mockResolvedValue([])} />);

    const input = await screen.findByLabelText("Catalog soda");
    await user.type(input, "Root Beer");
    await user.click(screen.getByRole("button", { name: /add “root beer” as a new soda/i }));
    await user.type(screen.getByLabelText("Brand"), " Sprecher ");
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        { brand: "Sprecher", name: "Root Beer", flavor: "Original" },
        "can",
      ),
    );
    await user.click(await screen.findByLabelText("Catalog soda"));
    await user.click(await screen.findByRole("option", { name: "Sprecher Root Beer — Original" }));
    await user.click(screen.getByLabelText("Form"));
    await user.click(screen.getByRole("option", { name: "Bottle" }));
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    await waitFor(() => expect(onAdd).toHaveBeenLastCalledWith(created, "bottle"));
  });

  it("requires a catalog selection or new soda", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AvailabilityForm onAdd={onAdd} loadCatalog={vi.fn().mockResolvedValue(catalog)} />);

    await screen.findByLabelText("Catalog soda");
    await user.click(screen.getByRole("button", { name: "Add soda" }));

    expect(screen.getByText("Choose a catalog soda or add a new one.")).toBeVisible();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
