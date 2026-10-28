import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from '../screens/HomeScreen';

describe('HomeScreen', () => {
  it('muestra el nombre del producto', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText('Socracia')).toBeTruthy();
  });

  it('explica la propuesta mayéutica', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText(/mayéutica/i)).toBeTruthy();
  });
});
